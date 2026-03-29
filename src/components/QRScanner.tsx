import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { X, QrCode, Camera, Keyboard, Check, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Capacitor } from "@capacitor/core";

interface QRScannerProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onClaimed?: (amount: number) => void;
}

const isNative = Capacitor.isNativePlatform();

const QRScanner = ({ userId, isOpen, onClose, onClaimed }: QRScannerProps) => {
  const [mode, setMode] = useState<"scan" | "manual">("scan");
  const [manualCode, setManualCode] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState<{ amount: number; balance: number } | null>(null);
  const [nativeScanning, setNativeScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen && mode === "scan") {
      if (isNative) {
        startNativeScan();
      } else {
        startCamera();
      }
    }
    return () => {
      if (isNative) {
        stopNativeScan();
      } else {
        stopCamera();
      }
    };
  }, [isOpen, mode]);

  // ── Native Capacitor MLKit scanner ──
  const startNativeScan = async () => {
    try {
      const { BarcodeScanner, BarcodeFormat } = await import("@capacitor-mlkit/barcode-scanning");

      // Check / request permission
      const { camera } = await BarcodeScanner.checkPermissions();
      if (camera !== "granted") {
        const req = await BarcodeScanner.requestPermissions();
        if (req.camera !== "granted") {
          toast({ title: "Camera permission denied", description: "Enter the code manually." });
          setMode("manual");
          return;
        }
      }

      setNativeScanning(true);

      // scan() opens a native full-screen camera overlay
      try {
        const { barcodes } = await BarcodeScanner.scan({
          formats: [BarcodeFormat.QrCode],
        });

        setNativeScanning(false);

        if (barcodes.length > 0) {
          const value = barcodes[0].rawValue || "";
          if (value.startsWith("HDATOPUP:")) {
            const code = value.replace("HDATOPUP:", "");
            handleClaim(code);
          } else {
            toast({ title: "Invalid QR", description: "This is not a valid topup card QR code.", variant: "destructive" });
          }
        }
      } catch (scanErr: any) {
        setNativeScanning(false);
        console.log("Scan cancelled:", scanErr?.message);
      }
    } catch (err: any) {
      console.error("Native scan error:", err);
      setNativeScanning(false);
      startCamera();
    }
  };

  const stopNativeScan = async () => {
    try {
      const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
      // Cancel any in-progress scan
      await BarcodeScanner.stopScan().catch(() => {});
    } catch {}
    setNativeScanning(false);
  };

  // ── Web camera fallback ──
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        scanningRef.current = true;
        scanFrame();
      }
    } catch (err) {
      console.error("Camera access denied:", err);
      setMode("manual");
      toast({ title: "Camera unavailable", description: "Enter the card code manually instead." });
    }
  };

  const stopCamera = () => {
    scanningRef.current = false;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const scanFrame = () => {
    if (!scanningRef.current || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      if ("BarcodeDetector" in window) {
        const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
        detector.detect(canvas).then((barcodes: any[]) => {
          if (barcodes.length > 0 && scanningRef.current) {
            const value = barcodes[0].rawValue;
            if (value?.startsWith("HDATOPUP:")) {
              scanningRef.current = false;
              const code = value.replace("HDATOPUP:", "");
              handleClaim(code);
            }
          }
        }).catch(() => {});
      }
    }

    animFrameRef.current = requestAnimationFrame(scanFrame);
  };

  const handleClaim = async (code: string) => {
    if (claiming || !code.trim()) return;
    setClaiming(true);
    try {
      const { data, error } = await supabase.functions.invoke("claim-promo", {
        body: { code: code.trim().toUpperCase(), user_id: userId, claim_type: "topup_card" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setClaimed({ amount: data.amount, balance: data.new_balance });
      onClaimed?.(data.amount);
      toast({ title: "🎉 Card Redeemed!", description: `${data.amount} MVR added to your wallet!` });
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
      // Resume scanning
      if (mode === "scan") {
        if (isNative) {
          startNativeScan();
        } else {
          scanningRef.current = true;
          scanFrame();
        }
      }
    } finally {
      setClaiming(false);
    }
  };

  const handleClose = () => {
    if (isNative) {
      stopNativeScan();
    } else {
      stopCamera();
    }
    setClaimed(null);
    setManualCode("");
    setMode("scan");
    onClose();
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <h2 className="text-white font-bold text-lg flex items-center gap-2">
          <QrCode className="w-5 h-5" />
          Scan Topup Card
        </h2>
        <button onClick={handleClose} className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <AnimatePresence mode="wait">
          {claimed ? (
            <motion.div
              key="claimed"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 300 }}
                className="w-24 h-24 rounded-full bg-emerald-500 flex items-center justify-center mx-auto mb-6"
              >
                <Check className="w-12 h-12 text-white" />
              </motion.div>
              <h3 className="text-white text-2xl font-extrabold mb-2">Card Redeemed!</h3>
              <p className="text-emerald-400 text-4xl font-extrabold mb-2">{claimed.amount} MVR</p>
              <p className="text-white/60 text-sm">New balance: {claimed.balance} MVR</p>
              <Button onClick={handleClose} className="mt-8 w-full max-w-[260px]">Done</Button>
            </motion.div>
          ) : mode === "scan" ? (
            <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-[300px]">
              {/* Camera view — native uses transparent WebView, web uses video element */}
              <div className="relative aspect-square rounded-3xl overflow-hidden bg-black mb-6">
                {!nativeScanning && (
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                )}
                <canvas ref={canvasRef} className="hidden" />
                {/* Scan overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-48 h-48 relative">
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-xl" />
                    <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-xl" />
                    <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-xl" />
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-xl" />
                    {/* Scanning line */}
                    <motion.div
                      animate={{ y: [0, 160, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute top-2 left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent"
                    />
                  </div>
                </div>
                {nativeScanning && (
                  <div className="absolute inset-0 flex items-end justify-center pb-4">
                    <p className="text-white/80 text-xs bg-black/40 px-3 py-1 rounded-full">Native camera active</p>
                  </div>
                )}
                {claiming && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  </div>
                )}
              </div>
              <p className="text-white/60 text-sm text-center mb-4">Point your camera at the QR code on the topup card</p>
              <button
                onClick={() => {
                  if (isNative) stopNativeScan(); else stopCamera();
                  setMode("manual");
                }}
                className="w-full py-3 text-white/80 text-sm font-medium flex items-center justify-center gap-2 hover:text-white transition-colors"
              >
                <Keyboard className="w-4 h-4" />
                Enter code manually
              </button>
            </motion.div>
          ) : (
            <motion.div key="manual" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-[320px]">
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-4">
                  <Keyboard className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-white text-lg font-bold">Enter Card Code</h3>
                <p className="text-white/50 text-sm mt-1">Type the code printed on your topup card</p>
              </div>
              <Input
                value={manualCode}
                onChange={e => setManualCode(e.target.value.toUpperCase())}
                placeholder="HDA-XXXX-XXXX-XXXX"
                className="bg-white/10 border-white/20 text-white text-center text-lg font-mono placeholder:text-white/30 mb-4"
              />
              <Button
                onClick={() => handleClaim(manualCode)}
                disabled={claiming || !manualCode.trim()}
                className="w-full gap-2"
              >
                {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Redeem Card
              </Button>
              <button
                onClick={() => { setMode("scan"); }}
                className="w-full py-3 text-white/80 text-sm font-medium flex items-center justify-center gap-2 hover:text-white transition-colors mt-2"
              >
                <Camera className="w-4 h-4" />
                Scan QR instead
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default QRScanner;

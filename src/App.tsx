import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import ImportUsers from "./pages/ImportUsers";
import Admin from "./pages/Admin";
import Driver from "./pages/Driver";
import Dispatch from "./pages/Dispatch";
import LiveMap from "./pages/LiveMap";
import Install from "./pages/Install";
import Track from "./pages/Track";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import NotFound from "./pages/NotFound";
import { useBranding } from "@/hooks/use-branding";

const queryClient = new QueryClient();

const BrandingInit = () => { useBranding(); return null; };

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrandingInit />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/driver" element={<Driver />} />
          <Route path="/import-users" element={<ImportUsers />} />
          <Route path="/admin" element={<NotFound />} />
          <Route path="/hda-control" element={<Admin />} />
          <Route path="/dispatch" element={<Dispatch />} />
          <Route path="/live-map" element={<LiveMap />} />
          <Route path="/install" element={<Install />} />
          <Route path="/install-passenger" element={<Install defaultTab="passenger" />} />
          <Route path="/install-driver" element={<Install defaultTab="driver" />} />
          <Route path="/track/:tripId" element={<Track />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

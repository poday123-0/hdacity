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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
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
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

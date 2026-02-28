import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const MODE_KEY = "hda_app_mode";

const Driver = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Set mode to driver and redirect to unified app
    localStorage.setItem(MODE_KEY, "driver");
    navigate("/", { replace: true });
  }, [navigate]);

  return null;
};

export default Driver;

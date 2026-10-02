// config.js
const ENVIRONMENTS = {
  local: {
    frontendUrl: "http://localhost:5173",
    backendUrl: "http://127.0.0.1:8000"
  },
  production: {
    frontendUrl: "https://www.trimdcv.com", // or CloudFront/custom domain
    backendUrl: "https://www.trimdcv.com"       
  }
};

// Toggle active environment here ("local" or "production")
export const CURRENT_ENV = "production"; 
export const CONFIG = ENVIRONMENTS[CURRENT_ENV];
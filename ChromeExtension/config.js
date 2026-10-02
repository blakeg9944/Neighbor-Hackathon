// config.js
const ENVIRONMENTS = {
  local: {
    frontendUrl: "http://localhost:5173",
    backendUrl: "http://127.0.0.1:8000"
  },
  production: {
    frontendUrl: "https://trimdcv.com", // S3/CloudFront static site — no www: that's the origin users are actually signed into
    backendUrl: "https://api.trimdcv.com"   // FastAPI on EC2 (Caddy); trimdcv.com/api/* is S3 and returns index.html
  }
};

// Toggle active environment here ("local" or "production")
export const CURRENT_ENV = "production"; 
export const CONFIG = ENVIRONMENTS[CURRENT_ENV];
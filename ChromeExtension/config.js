// config.js
const ENVIRONMENTS = {
  local: {
    frontendUrl: "http://localhost:5173",
    backendUrl: "http://127.0.0.1:8000"
  },
  production: {
    frontendUrl: "https://your-app.s3-website-us-east-1.amazonaws.com", // or CloudFront/custom domain
    backendUrl: "https://api.yourdomain.com"                          # or AWS EC2/App Runner/ALB endpoint
  }
};

// Toggle active environment here ("local" or "production")
export const CURRENT_ENV = "local"; 
export const CONFIG = ENVIRONMENTS[CURRENT_ENV];
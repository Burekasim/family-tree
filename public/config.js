// Runtime config — overwritten by GitHub Actions deploy step
window.APP_CONFIG = {
  apiBase: '',           // empty = same-origin (local dev); replaced with CloudFront URL in production
  usePresignedUpload: false   // set to true in production
};

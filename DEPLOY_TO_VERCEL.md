# Deploying the Calendar Merge Frontend to Vercel (CLI)

This guide walks you through deploying the `web/` frontend of the Calendar Merge Service to Vercel using the command line.

---

## Prerequisites
- Node.js and npm installed
- Vercel CLI installed (`npm install -g vercel`)
- Access to your backend API (already deployed)
- Google OAuth configured for your Vercel domain

---

## 1. Install Vercel CLI
```bash
npm install -g vercel
```

## 2. Login to Vercel
```bash
vercel login
```
Follow the prompts to authenticate.

## 3. Prepare Your Frontend
- Ensure your frontend is in the `web/` directory.
- Confirm it builds locally:
  ```bash
  cd web
  npm install
  npm run build
  ```
- If you use environment variables (e.g., `VITE_API_URL`), create a `.env` file in `web/` for local development:
  ```env
  VITE_API_URL=https://your-backend-api-url
  ```

## 4. Initialize Vercel Project
From the `web/` directory:
```bash
vercel
```
- Accept or enter a project name
- Confirm the directory to deploy (should be `web`)
- Vercel will auto-detect Vite
- When prompted, set environment variables (see next step)

## 5. Set Environment Variables on Vercel
You can set environment variables interactively during setup, or later:
```bash
vercel env add VITE_API_URL production
```
- Enter your backend API URL when prompted
- Repeat for any other variables

## 6. Deploy to Production
```bash
vercel --prod
```
- Vercel will build and deploy your site
- The CLI will display your public URL (e.g., `https://your-app.vercel.app`)

## 7. Update Google OAuth Redirect URI
- Go to Google Cloud Console
- Add your Vercel URL (e.g., `https://your-app.vercel.app`) as an allowed redirect URI for OAuth

## 8. Test Your Site
- Visit your Vercel URL
- Test the OAuth flow and API calls

---

## Useful Vercel CLI Commands
| Task                        | Command                                 |
|-----------------------------|-----------------------------------------|
| Install Vercel CLI          | `npm install -g vercel`                 |
| Login to Vercel             | `vercel login`                          |
| Initialize project          | `vercel`                                |
| Set env variable            | `vercel env add VITE_API_URL production`|
| Deploy to production        | `vercel --prod`                         |
| View deployment logs        | `vercel logs <deployment-url>`          |

---

## Troubleshooting
- If build fails, check your `vite.config.js` and `package.json` scripts
- Ensure all required environment variables are set on Vercel
- For OAuth issues, double-check the redirect URI in Google Cloud Console

---

**You’re done! Your frontend is now live on Vercel.**

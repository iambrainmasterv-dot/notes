# Deploy NoteTasks on Railway

Railway will build the Docker image and run it. No extra config required.

## 1. Push your code to GitHub

If the project is not in a repo yet:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/notesapp.git
git push -u origin main
```

Replace `YOUR_USERNAME/notesapp` with your actual GitHub repo URL.

## 2. Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in (GitHub is easiest).
2. Click **New Project**.
3. Choose **Deploy from GitHub repo**.
4. Select the `notesapp` repository (grant Railway access to it if asked).
5. Railway will detect the **Dockerfile** and start a build.

## 3. Get a public URL

1. Open the new service (the card that appears after the repo is connected).
2. Go to the **Settings** tab.
3. Under **Networking**, click **Generate Domain**.
4. Copy the URL (e.g. `notetasks-production-xxxx.up.railway.app`).

Your app will be live at that URL. New pushes to `main` will trigger automatic redeploys.

## 4. (Optional) Use the Railway CLI

```bash
# Install: npm i -g @railway/cli
railway login
railway link   # link this folder to a Railway project
railway up     # build and deploy from current directory
```

## Notes

- **Free tier:** Railway offers a trial; after that you pay for usage. Static + nginx is very light.
- **Custom domain:** In the service **Settings** → **Networking** → **Custom Domain**, add your domain and set the CNAME record your registrar shows.
- **Env vars:** If you add backend or API keys later, set them in **Variables** for the service; they are available at build and runtime.

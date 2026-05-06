# Deployment Guide: Nard AI White-Label

This guide explains how to deploy this application to **Firebase Hosting** and set up an automated deployment pipeline using **GitHub Actions**.

## Prerequisites

1.  **Firebase Project**: You must have a Firebase project created. You mentioned using `gen-lang-client-0714606386`.
2.  **GitHub Repository**: Your code should be pushed to a repository (e.g., `Project-Maitri/Nard_AI_WL`).
3.  **Firebase CLI**: Installed locally (`npm install -g firebase-tools`).

---

## Step 1: Generate Firebase Service Account

To allow GitHub to deploy to your Firebase project, you need a Service Account key.

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Select your project: **Nard AI** (`gen-lang-client-0714606386`).
3.  Click the **Gear icon (Project Settings)** > **Service accounts**.
4.  Click **Generate new private key** and download the JSON file. **Keep this file secure!**

---

## Step 2: Configure GitHub Secrets

1.  Open your repository on GitHub: `https://github.com/Project-Maitri/Nard_AI_WL`.
2.  Go to **Settings** > **Secrets and variables** > **Actions**.
3.  Click **New repository secret**.
4.  **Name**: `FIREBASE_SERVICE_ACCOUNT_LOK_MITRA_APP_B7A0D`
5.  **Value**: Paste the entire content of the JSON file you downloaded in Step 1.
6.  Click **Add secret**.

---

## Step 3: Understanding the GitHub Workflows

I have already created the necessary workflow files in your project under `.github/workflows/`:

-   **`firebase-hosting-merge.yml`**: Automatically deploys the app to your live site whenever you push or merge changes to the `main` branch.
-   **`firebase-hosting-pull-request.yml`**: Automatically creates a "preview" URL whenever a Pull Request is opened, allowing you to test changes before merging.

---

## Step 4: Environment Variables (Critical)

This app relies on the **Gemini API Key**. 

### Which Secret to create?
You only need to create **ONE** secret in GitHub, but I recommend creating **both** for maximum compatibility:
1.  `VITE_GEMINI_API_KEY`: (Recommended) The standard for Vite apps.
2.  `GEMINI_API_KEY`: (Fall-back) Used by many legacy scripts.

**Value**: Use the same Gemini API key for both.

### How to add them to GitHub:
1.  Go to **Settings** > **Secrets and variables** > **Actions** on GitHub.
2.  Click **New repository secret**.
3.  Add `VITE_GEMINI_API_KEY` with your actual key.
4.  Add `GEMINI_API_KEY` with the same key.

### How they are used:
- The GitHub workflow (in `.github/workflows/`) is now configured to take these secrets and "inject" them into the app during the build process (`npm run build`).
- Once injected, the app will no longer say "AI service not initialized".

### Updating the Workflow:
I have already updated the workflow files to include the `env` block. It looks like this:
```yaml
      - run: npm ci && npm run build
        env:
          VITE_GEMINI_API_KEY: ${{ secrets.VITE_GEMINI_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```


---

## Step 5: First Deployment

Simply push your local changes to GitHub:

```bash
git add .
git commit -m "Setup Firebase Hosting deployment"
git push origin main
```

You can monitor the progress under the **Actions** tab in your GitHub repository. Once finished, your app will be live at `https://gen-lang-client-0714606386.web.app`.

---

## Troubleshooting

-   **Permission Denied**: Ensure the Service Account has the "Editor" or "Firebase Hosting Admin" role in the Google Cloud Console.
-   **Build Failed**: Check the logs in GitHub Actions. Usually, it's a missing dependency or a syntax error in the code.
-   **Missing Key**: If the AI doesn't work after deployment, check if the `GEMINI_API_KEY` is correctly set in your environment or provided via the `/api/gemini-token` endpoint.

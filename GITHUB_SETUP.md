# GitHub Repository Setup Guide

Complete these steps in your GitHub repository settings to maximize discoverability and professionalism.

---

## 1. Add Social Preview Image

The social preview image appears when your repo is shared on social media, Slack, Discord, etc.

**Steps:**
1. Go to your repository on GitHub
2. Click **Settings** (gear icon)
3. Scroll to **Social preview**
4. Click **Edit** → **Upload an image**
5. Upload `screenshots/social-preview.png` (1280x640px)
6. Click **Save**

---

## 2. Add Repository Topics/Tags

Topics help people discover your repository through search. They appear as clickable tags under your repo title.

**Steps:**
1. Go to your repository main page
2. Click the ⚙️ gear icon next to **About** (right sidebar)
3. In the **Topics** field, add these tags:

**Recommended Topics:**
```
flipper-zero
flipper
co2-sensor
co2-monitoring
data-visualization
web-serial-api
chart-js
javascript
csv-viewer
air-quality
environmental-monitoring
iot
usb-serial
browser-based
```

**Priority tags (add these first):**
- `flipper-zero` — Main discovery tag for Flipper community
- `co2-monitoring` — Category tag
- `data-visualization` — Feature tag
- `web-serial-api` — Technical tag
- `javascript` — Language tag

---

## 3. Update Repository Description

**Steps:**
1. Click the ⚙️ gear icon next to **About**
2. Set description to:
   ```
   🌬️ Visualize Flipper Zero CO2 data in your browser — plug in via USB, see charts instantly. No apps or drivers needed.
   ```
3. Set website URL to: `https://www.flipperco2.com/`

---

## 4. Add a License

If you haven't already:
1. Click **Add file** → **Create new file**
2. Name it `LICENSE`
3. Click **Choose a license template**
4. Select **MIT License**
5. Fill in the year and your name
6. Commit the file

---

## 5. Configure Repository Features

**Steps:**
1. Go to **Settings** → **General**
2. Under **Features**, enable:
   - ✅ Issues
   - ✅ Discussions (optional, for community Q&A)
3. Under **Pull Requests**, consider enabling:
   - ✅ Allow squash merging
   - ✅ Allow auto-merge

---

## 6. Set Up GitHub Pages (Optional)

Host the app directly from GitHub:

1. Go to **Settings** → **Pages**
2. Under **Source**, select:
   - Branch: `main`
   - Folder: `/ (root)`
3. Click **Save**
4. Your app will be available at: `https://harryob2.github.io/co2_web_app/`
5. Update the README demo link once it's live!

---

## Checklist

- [ ] Social preview image uploaded
- [ ] Topics added (at least 5)
- [ ] Description updated
- [ ] License added
- [ ] GitHub Pages enabled (optional)
- [x] Demo link updated in README (https://www.flipperco2.com/)

---

## Files Created for You

| File | Purpose |
|------|---------|
| `README.md` | Professional, compelling readme with badges, screenshots, value prop |
| `screenshots/social-preview.png` | 1280x640 image for GitHub social preview |
| `social-preview.html` | Source file used to generate the social preview image |
| `GITHUB_SETUP.md` | This setup guide (can be deleted after setup) |

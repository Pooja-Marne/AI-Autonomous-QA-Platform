# ---- Frontend build ----
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ---- Backend + runtime image ----
FROM node:22-slim
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ .
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Real Playwright test environment — the platform executes these specs
# directly (no simulated runner), so the package, config, and a real browser
# all need to be present in the image, not just the spec files.
WORKDIR /app/tests
COPY tests/package*.json ./
RUN npm ci
COPY tests/playwright.config.js ./
COPY tests/loadEnv.js ./
COPY tests/test.env ./
COPY tests/playwright ./playwright
# Only chromium is installed to keep image size/build time reasonable —
# playwrightRunner.service.js pins PROJECT='chromium' to match.
RUN npx playwright install --with-deps chromium

WORKDIR /app/backend
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "--experimental-sqlite", "src/index.js"]

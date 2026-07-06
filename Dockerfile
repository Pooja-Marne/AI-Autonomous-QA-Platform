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

# The Coverage Intelligence Agent scans this directory for existing test
# coverage (config.automation.repoPath resolves to /app/tests in this image).
COPY tests/playwright /app/tests/playwright

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "--experimental-sqlite", "src/index.js"]

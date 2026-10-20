# Official runtime is Google Cloud Run. Render remains a temporary host.
# Vite inlines VITE_* values at build time. Pass them as build args.
# Runtime secrets (SESSION_SECRET, SUPABASE_SERVICE_ROLE_KEY, Paynow, Groq)
# must be supplied as Cloud Run environment variables, never baked in.

FROM node:22.12.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_SENTRY_DSN=""
ARG APP_URL
ARG SHOP_HOSTS="false"
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    APP_URL=$APP_URL \
    SHOP_HOSTS=$SHOP_HOSTS \
    VITE_SHOP_HOSTS=$SHOP_HOSTS
RUN npm run build

FROM node:22.12.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=8080
COPY --from=build /app/.output /app/.output
EXPOSE 8080
CMD ["node", ".output/server/index.mjs"]

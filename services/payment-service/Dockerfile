# For services that are failing to build
# This bypasses TypeScript and runs directly with tsx
FROM node:20-alpine

RUN apk add --no-cache python3 make g++ curl

WORKDIR /app

COPY . .

# Install dependencies
RUN cd shared && npm ci
RUN cd services/payment-service && npm ci

WORKDIR /app/services/payment-service

# Run directly with tsx instead of building
CMD ["npx", "tsx", "src/index.ts"]

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3003}/health || exit 1
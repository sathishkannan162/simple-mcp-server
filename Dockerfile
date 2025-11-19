# Use Node.js LTS version as base image
FROM node:20-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

# Copy the application source code (excluding node_modules and dist via .dockerignore)
COPY . .

# # Build the TypeScript code
RUN pnpm run build

# Expose the port that the app runs on
EXPOSE 8080

# Health check endpoint for Cloud Run
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Start the application
CMD ["pnpm", "run", "start"]
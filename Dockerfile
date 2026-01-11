FROM node:20-alpine

# Install build dependencies and git
RUN apk add --no-cache python3 make g++ git bash

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create data and workspace directories
RUN mkdir -p /app/data /app/workspace

# Set environment variable for workspace
ENV AGENT_WORKSPACE=/app/workspace

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]

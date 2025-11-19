# # Use official Node.js LTS image as the base
# # FROM node:18-alpine
# FROM node:18-alpine


# # Set working directory
# WORKDIR /app

# # Copy package.json and package-lock.json
# COPY package*.json ./

# # Install dependencies
# RUN npm install 

# # Copy the rest of the application code
# COPY . .

# RUN npx prisma generate

# # Build the NestJS project
# RUN npm run build


# # Expose the port your app runs on
# EXPOSE 3000

# # Start the application
# CMD ["npm", "run","start:dev"]
# # CMD ["npm", "run", "start:prod"]




# new one

# Build stage
# FROM node:18-alpine AS builder
# WORKDIR /app

# COPY package*.json ./
# RUN npm ci   # better than npm install for reproducible builds

# COPY . .
# RUN npx prisma generate
# RUN npm run build

# # Production stage
# FROM node:18-alpine AS production
# WORKDIR /app

# # Copy only necessary files from builder
# COPY --from=builder /app/dist ./dist
# COPY --from=builder /app/node_modules ./node_modules
# COPY --from=builder /app/package*.json ./
# COPY --from=builder /app/prisma ./prisma

# # Generate Prisma client again (in case base image differs)
# RUN npx prisma generate

# EXPOSE 3000

# # Run migrations and then start the app (recommended)
# CMD ["sh", "-c", "npx prisma migrate deploy && npm run start:prod"]



cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: xtra-change-be-app
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://postgres:NEW_PASSWORD_HERE@xtra.cvg4usam0kqz.us-east-2.rds.amazonaws.com/xtra_change_4amg
EOF

# 3. Rebuild and start fresh
docker compose down --remove-orphans
docker rm -f xtra-change-be-app 2>/dev/null || true
docker compose up -d --build

# 4. Watch logs — it WILL work this time
docker logs -f xtra-change-be-app
FROM mcr.microsoft.com/playwright:v1.49.1-focal

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy project files
COPY . .

# Build the project (if using TypeScript build script)
RUN npm run build || true

# Environment variables will be managed by Easypanel
# Make sure to set TZ in Easypanel to America/Sao_Paulo

# Command to run the bot
CMD ["npm", "start"]

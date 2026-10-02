# KIMS Queue backend — production container.
# Uses Node's built-in node:sqlite (Node >= 22.5). No native deps to compile.
FROM node:22-slim

WORKDIR /app

# Install prod deps only (cached by Docker layer).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
# Hosts usually inject PORT; fall back to 8080.
ENV PORT=8080

EXPOSE 8080
CMD ["npm", "start"]
FROM node:20-alpine

WORKDIR /app

# 安装依赖
COPY package.json package-lock.json* ./
RUN npm install

# 复制源代码
COPY . .

# 生成 Prisma Client
RUN npx prisma generate || true

EXPOSE 3000

CMD ["node", "src/app.js"]

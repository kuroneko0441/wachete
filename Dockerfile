FROM node:14-alpine as npm
WORKDIR /app
COPY ./package.json ./package.json
COPY ./package-lock.json ./package-lock.json
RUN npm ci

FROM npm as builder
COPY ./src/ ./src/
COPY ./babel.config.json ./babel.config.json
COPY ./tsconfig.json ./tsconfig.json
COPY ./tsconfig.app.json ./tsconfig.app.json
RUN npm run build

FROM npm as runner
COPY ./assets/ ./assets/
COPY --from=builder /app/dist/ ./dist/

CMD [ "node", "dist/main.js" ]

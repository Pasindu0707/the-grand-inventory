# Stage 1: Build Angular app
FROM node:20-alpine AS build

WORKDIR /usr/src/app

COPY package.json ./

RUN npm install --legacy-peer-deps

COPY . .

ARG BUILD_CONFIGURATION=production
RUN npm run build -- --output-path=dist/beautech-master-web-app --configuration=${BUILD_CONFIGURATION}

# Stage 2: Nginx server
FROM nginx:alpine

ENV TZ=Asia/Kolkata
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

COPY conf/nginx.conf /etc/nginx/nginx.conf

RUN mkdir /usr/share/app-deploy
RUN rm /etc/nginx/conf.d/default.conf

COPY --from=build /usr/src/app/dist /usr/share/app-deploy
COPY --from=build /usr/src/app/dist/beautech-master-web-app /usr/share/app-deploy/beautech-master-web-app

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# Usa una imagen base oficial de Nginx desde Docker Hub
FROM nginx:alpine

# Copia los archivos de tu proyecto (html, css, js) a la carpeta del servidor web
COPY . /usr/share/nginx/html

# Expone el puerto 80 para que el servidor pueda recibir peticiones
EXPOSE 80

# Comando para iniciar el servidor Nginx en primer plano
CMD ["nginx", "-g", "daemon off;"]

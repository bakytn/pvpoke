FROM php:apache-buster
RUN a2enmod rewrite deflate headers expires filter && (a2enmod brotli || true)
COPY docker/apache-pvpoke.conf /etc/apache2/conf-available/pvpoke.conf
RUN a2enconf pvpoke

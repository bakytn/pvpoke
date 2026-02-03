FROM php:apache-buster
RUN a2enmod rewrite
COPY docker/apache-pvpoke.conf /etc/apache2/conf-available/pvpoke.conf
RUN a2enconf pvpoke

FROM php:8.4.27-apache-bookworm
RUN a2enmod rewrite deflate headers expires filter ssl && (a2enmod brotli || true)
COPY docker/apache-pvpoke.conf /etc/apache2/conf-available/pvpoke.conf
COPY docker/apache-pvpoke-ssl.conf /etc/apache2/conf-available/pvpoke-ssl.conf
RUN mkdir -p /etc/apache2/ssl \
	&& openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 3650 \
		-keyout /etc/apache2/ssl/pvpoke-local.key \
		-out /etc/apache2/ssl/pvpoke-local.crt \
		-subj "/CN=localhost" \
		-addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:44.203.15.183" \
	&& a2enconf pvpoke pvpoke-ssl

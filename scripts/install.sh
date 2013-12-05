#!/bin/bash

# wget -O - http://192.168.1.112/vod/install.sh | bash -s 4

#host="http://joao.algumavez.com/vod/"


host="http://192.168.1.112/vod/"
tmpdir="/tmp/vod_install.$$/"

D_SNMPD_CONF="${host}snmpd.conf"
T_SNMPD_CONF="${tmpdir}snmpd.conf"
I_SNMPD_CONF="/etc/snmp/snmpd.conf"
SNMPD_SERVICE="/etc/init.d/snmpd"


D_BTSYNC_CONF="${host}btsync.conf"
T_BTSYNC_CONF="${tmpdir}btsync.conf"
I_BTSYNC_CONF="/etc/btsync/btsync.conf"
BTSYNC_SERVICE="/etc/init.d/btsync"
BTSYNC_SHARE_FOLDER="/var/www/video/vod"
BTSYNC_LISTEN_PORT=8123


D_NGINX_CONF="${host}nginx.conf"
T_NGINX_CONF="${tmpdir}nginx.conf"
I_NGINX_CONF="/etc/nginx/sites-available/default"
NGINX_SERVICE="/etc/init.d/nginx"


HOST_1="10.10.10.11"
HOST_2="10.10.10.12"
HOST_3="10.10.10.13"
HOST_4="10.10.10.14"
TOTAL_HOSTS=4

HOSTNAME=$(hostname)


########################################

	echo "## Creating dir '${tmpdir}'"

	mkdir -p $tmpdir

########################################


########################################

	echo "## Setting eth1"

	for (( i = 1 ; i <= $TOTAL_HOSTS ; i++ )); do
	
		if [ "$1" == "$i" ]; then
		
			varname="HOST_${i}"
			
			ifconfig eth1 down
			ifconfig eth1 "${!varname}" netmask 255.255.255.0
		
			break
		fi
	
	done

########################################


########################################

	echo "## trying to stop snmpd"

	$SNMPD_SERVICE stop 2>/dev/null

########################################


########################################

	echo "## Adding btsync repo to apt-get sources"

	# add btsync repo key
	apt-key adv --keyserver keys.gnupg.net --recv-keys 6BF18B15 > /dev/null

	CODENAME=$(lsb_release -cs | sed -n '/lucid\|precise\|quantal\|raring\|saucy\|trusty\|squeeze\|wheezy\|jessie\|sid/p')
	echo deb http://debian.yeasoft.net/btsync ${CODENAME:-sid} main > ~/btsync.list
	echo deb-src http://debian.yeasoft.net/btsync ${CODENAME:-sid} main >> ~/btsync.list
	unset CODENAME
	mv ~/btsync.list /etc/apt/sources.list.d/btsync.list
	chown root:root /etc/apt/sources.list.d/btsync.list

########################################


########################################

	echo "## Updating apt sources"

	apt-get update > /dev/null

########################################


########################################

	echo "## Installing snmp snmpd btsync nginx"

	OLD_DEBIAN_FRONTEND=$DEBIAN_FRONTEND
	export DEBIAN_FRONTEND=noninteractive
	
	apt-get install -yf snmp snmpd btsync nginx

	export DEBIAN_FRONTEND=$OLD_DEBIAN_FRONTEND

########################################


########################################

	echo "## Getting snmpd.conf"

	wget -nv -O - "$D_SNMPD_CONF" > "$T_SNMPD_CONF"
	
	$SNMPD_SERVICE stop 2>/dev/null

	cat "$T_SNMPD_CONF" > "$I_SNMPD_CONF"

	$SNMPD_SERVICE  restart

########################################


########################################

	echo "## Getting btsync.conf"
	
	wget -nv -O - "$D_BTSYNC_CONF" > "$T_BTSYNC_CONF"
	
	mkdir -p "$BTSYNC_SHARE_FOLDER"
	
	echo "Just a test file" > "${BTSYNC_SHARE_FOLDER}/test_file"
	
	HOST_LIST=""
	HOST_COUNT=0
	
	for (( i = 1 ; i <= $TOTAL_HOSTS ; i++ )); do
	
		if [ "$1" != "$i" ]; then
		
			if [ $HOST_COUNT -gt 0 ]; then
				HOST_LIST="${HOST_LIST},"
			fi
			
			varname="HOST_${i}"
			HOST_LIST="${HOST_LIST}\n\t\"${!varname}:${BTSYNC_LISTEN_PORT}\""
			
			((HOST_COUNT++))
		fi
	
	done
	
	$BTSYNC_SERVICE stop 2>/dev/null
	
	rm -f /etc/btsync/debconf-default.conf 2>/dev/null
	
	cat "$T_BTSYNC_CONF" | sed \
		-e "s@##LISTEN_PORT##@${BTSYNC_LISTEN_PORT}@g" \
		-e "s@##MY_DEVICE_NAME##@${HOSTNAME}@g" \
		-e "s@##SINC_DIR_FOLDER##@${BTSYNC_SHARE_FOLDER}@g" \
		-e "s@##SINC_HOSTS##@${HOST_LIST}@g" \
		> "$I_BTSYNC_CONF"
	
	$BTSYNC_SERVICE restart
	
########################################


########################################

	echo "## Getting nginx.conf"
	
	wget -nv -O - "$D_NGINX_CONF" > "$T_NGINX_CONF"
	
	$NGINX_SERVICE stop 2>/dev/null
	
	cat "$T_NGINX_CONF" > "$I_NGINX_CONF"
	
	$NGINX_SERVICE restart

########################################


########################################

	echo "## Cleaning tmp files"

	rm -rf "$tmpdir"

########################################

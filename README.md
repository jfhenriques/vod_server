
###################################################

## VOD Load balancer

###################################################


Os scripts na pasta scripts foram desenvolvidos para serem servidos através do http de forma a poderem ser instalados com:
	wget -O - http://IP_DO_HOST/vod/install.sh | bash -s ID_DA_MAQUINA

IP_DO_HOST deve ser o IP que tem os ficheiros da pasta script disponível para download.

Deve ser alterada a variável "host" do ficheiro install.sh com o IP_DO_HOST, de forma ao sript poder fazer o download dos ficheiros em falta correctamente.

a variável ID_DA_MAQUINA é um id numérico entre 1 e 4, inclusive, quer servirá para configurar automáticamente a placa eth1 com o ip correcto.


Após extrair o conteúdo do zip para um directório, deve ser executado "npm install" de forma a instalar as dependências do projecto.


De seguida encontra a estrutura exemplo fo ficheiro de configuração da aplicação:

{
	"updateInterval": 3,
	"ifaceTimeout": 2,

	"metricTimeframe": 30,
	"metricLastSecs": 10,
	"metricLastSecsWeight": 0.7,

	"priorityLists": true,

	"debug": false,

	"ifaceLimitRate": 0.8,
	"clientDownloadMbits": 10,

	"servers": [
		{
			"enabled": true,
			"name": "Server 1 (tux1)",
			"host": "10.10.10.11",
			"publicHost": "172.16.1.31:9000",
			"community": "com28481898527262025229",
			"port": 161,
			"iface": "eth0",
			"ifaceRateMbits": 100
		},
		...
	]
}


"updateInterval": será a frequência do update ao snmp de cada

"ifaceTimeout": o snmp coloca em cache vários valores que são actualizados com frequência. A tabela iFace (dados das interfaces de rede) tem como padrão, 15 segundos de cache. Este valor é muito alto para este tipo de projecto, por isso a aplicação logo de início tenta efectuar um pedido para alterar este valor para um valor inferior ao do updateInterval.

"metricTimeframe", "metricLastSecs" e "metricLastSecsWeight":
De forma a suavizar os valores do TX das interfaces dos servidores, é mantido uma lista com os últimos valores recebidos, que serão utilizados para calcular a métrica de cada servidor.
	"metricTimeframe" indica durante quantos segundos memorizar os últimos valores recebidos
	"metricLastSecs" em segundos, terão uma importância de "metricLastSecsWeight" (em percentagem de 0.0 a 1.0)
	Ou seja, no exemplo acima dado, a métrica de cada servidor será calculada com base nos últimos 30 segundos de valores recebidos, tendo os últimos 10 segundos um peso de 70% no cálculo da métrica.

"priorityLists": true/false, indica se devem ser utilizadas listas de prioridades.
	Esta flag tem duas funcionalidades quando activada:
	1) De certa forma será efectuado género de "round-robin" distribuindo os pedidos por diversos servidores com diferentes níveis de prioridades
	2) O nível de prioridade um servidor indica quantos novos pedidos este servidor foi escolhido antes de receber uma nova actualização do valor de TX do mesmo (vindo do SNMP).

	Desta forma, sendo o nível de prioridade maior que zero, este será multiplicado por "clientDownloadMbits" (em MegaBits) e somado à métrica actual do sevidor, simulando a carga possível que estes clientes ainda não contabilizados possam estar a ter, e fazendo género de uma pré alocação de recursos neste servidor.


"ifaceLimitRate": valor máximo disponível (em percentagem compreendida entre 0.0 e 1.0) da interface de cada servidor, antes de considerar o mesmo como cheio. Estando o servidor cheio, e caso existam mais servidores em queue, será retirado o primeiro da queue e acrescentado à lista dos servidores activos, passando a estar disponível para responder a este e futuros pedidos. Deve ser SEMPRE	inferior a ~95%, caso contrário nunca será possível lançar novos servidores.

"servers": a lista de servidores disponíveis
	"enabled": true/false
	"name": nome simbólico, não tem qualquer importância a não ser para os logs da consola
	"host": ip privado, que estará à escuta para pedidos SNMP
	"publicHost": ip público, que deverá ser retornado como o endereço que os clientes se deverão conectar para receber o vídeo
	"community": comunidade do snmp (verificar scripts de configuração)
	"port": porta do snmo (por defeito 161)
	"iface": interface que deverá ser monitorizada no servidor (por defeiro eth0)
	"ifaceRateMbits": MegaBits da interface (10/100/1000)




O servidor deverá correr na mesma máquina que o servidor django, e poderá ser lançado através de
	node balancer.js

O balancer.js poderá ser lançado através de soluções mais sofisticadas, muito comuns em ambientes de alta confiança, como o "pm2", "supervidor", "forever", etc, que funcionam como watchdogs do processo do node, e caso por alguma razão se o processo crashar, voltará a ser lançado.

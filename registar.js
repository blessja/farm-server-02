const rosterSource = String.raw`
Dorp Mans
[30	Lekeba Patrick
66	Bester Nevil
2010	Rooi Gerswhinn Kervi
2031	George Lezeltrich Ahnt
2041	Meyers Carlton Elvano
2044	Benjamin Justin
2046	Barends Damian Siyabong
2051	Vermeulen Neil James
2052	De Vlam Donnovan Jerome
2053	Buys Shane
2054	Januarie Jemaine
2055	Julies Johnny
2056	Visagie Raymond James
2057	Van Wyk Johannes
2058	Martin Jason
2059	Manuel Anderson
2060	Ludick Hendre
2062	Olivier Ethan Alvino
2064	Van Wyk Carlo Corne
2065	Jooste Vivian
2066	Malgas Daniel
2067	Steytler Joewayne
2068	Pothiah Ralwin Andriano
7022	Ziwengu Ahlumile
],
Dorp Vrouens
[4146	Ntiisa Puseletso
5010	Lambrechts Liza
5020	Swarts Audrey Nomfusi
5056	Solitswayi Abenathi
5057	Solitswayi Nokuphiwa
5107	Toyo Notokazi Victor
5155	George Elizabeth
5157	Malgas Puseletso
5183	Honcwana Zizo
5187	Lambregts Elzaan Jamie-Le
5189	Van Wyk Lorraine
5192	Philander Junine Diana
5194	Visser Bianca
5196	Dulman Francolene
5198	Plaatjies Felecia
5206	Sass Jacqueline
5207	Julius Chrisma Natilen
5208	Conradie Justine Elaine
5209	Petro Maritza Abigail
5210	Manuel Michell
5212	Swem Belinda
5213	Esau Elana
5214	Esau Salome
5215	Esau Wilmary Ashlene
6002	Plaatjies Gisella Giome
6035	Willemse Izel Marionet
6047	Rooi Desmonia Levoni
],
Permanent Mans
[4	De Bruin Gerald
6	Louw Freddie
7	Pothiah Bronwin
8	De Bruin David
9	Vis Adoons
10	Barns Pieter
16	Louw Ryan Lucas
34	Kenna Nigel
67	Barends Marquin Jacohay
2006	Moleta Fanie
2014	Jors Sandick Christo
2017	Bruintjies Gerhard
2029	Williams John Martin
2038	Koopman Isak Jacobus
],
Permanent Vrouens
[1001	Swart Benita
1005	Van Wyk Leah
1006	De Bruin Mercia
1008	Van Wyk Jeandre
1009	Barnes Ansie
1010	Jackson Patricia
1011	De Bruin Anna
1012	Louw Karen
1013	Vis Christeline
1015	Sylvester Sandton
1016	Mapolisa Concilia
1017	Lottering Allyssia
1018	Koopman Francis
1023	George Rozane
1024	Bruintjies Deidre Justine
1027	Vlotman Geraldine
1029	Lottering Megan Esmerelda
5204	Klassen Shelley-Anne Ch
6006	Rooi Lena
],
 Zim Mans
[2049	Chamisa Takunda
3001	Mombeshora Collen
3007	Chaibva Knowledge
3010	Jackson Blessing
3011	Kanyinji Daniel
3016	Chaibva Brain
3020	Chaibva Elias
3021	Badza Tafadzwa
3036	Katenga Jealous
3038	Ajida Morgen
3044	Ngazimbi Brendon
3047	Mutanda Diverton
3048	Matanha Blessing
3049	Mako Simbarashe
3051	Kanyinji Joe
3052	Muwadzuri Ishmael
],
Zim Mans Met Pert
[3003	Mapolisa MacDonald
3004	Kasonde Anderson
3006	Kachenje Benson
],
Zim Vrouens
[4003	Shambare Precious
4015	Rore Caroline
4017	Chaibva Trace
4020	Sithole Rumbidzai
4022	Mushandu Sekayi
4044	Chitanda Mirica
4051	Phiri Jane
4057	Chamisa Florence
4060	Sithole Ayanda
4061	Nyawaranda Tsitsi
4102	Kaitano Moleene
4111	Kurehwa Crecencia
4115	Muchacha Sibongile
4116	Badza Gamuchirai
4120	Chaibva Annie
4122	Kamwendo Natasha Gremlin
4145	Mutetwa Eunice
4149	Phiri Agnes
4151	Makonese Molleen
4152	Chikago Theresa
4154	Chigwinya Naume
4156	Nyamadzave Temptation
4157	John Charity Monica
4158	Musorowego Runyararo
4159	Chiku Partial
4160	Takaendesa Mary
4161	Bhanhire Faustinah
4163	Moshoeshoe Ntheoleng Evodi
4164	Ntiisa Liteboho Alina
4166	Matsvai Beauty
],
 Zim Vrouens Met Pert
[4001	Murandu Mebo	
4010	Sande Ruth	
4014	Kanyinji Mildret	
4024	Ngazimbi Wadzanayi	
4070	Chikoroond Jocyline
4101	Maphupho Siwiselo
]
`;

const teams = {};
let currentTeam = "";

for (const line of rosterSource.split(/\r?\n/)) {
  const worker = line.match(/^\s*\[?(\d+)\s+(.+?)\s*$/);
  if (worker) {
    const name = worker[2].replace(/\]\s*,?$/, "").trim();
    if (!teams[currentTeam]) teams[currentTeam] = [];
    teams[currentTeam].push({ workerID: worker[1], name });
    continue;
  }

  const heading = line.trim().replace(/,$/, "");
  if (heading && heading !== "]") currentTeam = heading;
}

module.exports = teams;
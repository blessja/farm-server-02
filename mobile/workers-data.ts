// workers-data.ts
// Frontend API for worker data only
// Blocks, rows, and job types are handled by backend

export interface Worker {
  workerID: string;
  name: string;
}

// Add your workers here in the same format as QR code data
export const WORKERS_DATA: Worker[] = [
 { workerID: "4146", name: "Ntiisa Puseletso" },
{ workerID: "5010", name: "Lambrechts Liza" },
{ workerID: "5020", name: "Swarts Audrey Nomfusi" },
{ workerID: "5056", name: "Solitswayi Abenathi" },
{ workerID: "5057", name: "Solitswayi Nokuphiwa" },
{ workerID: "5107", name: "Toyo Notokazi Victor" },
{ workerID: "5155", name: "George Elizabeth" },
{ workerID: "5157", name: "Malgas Puseletso" },
{ workerID: "5183", name: "Honcwana Zizo" },
{ workerID: "5187", name: "Lambregts Elzaan Jamie-Le" },
{ workerID: "5189", name: "Van Wyk Lorraine" },
{ workerID: "5196", name: "Dulman Francolene" },
{ workerID: "5198", name: "Plaatjies Felecia" },
{ workerID: "5205", name: "Struis Lee Ann" },
{ workerID: "5206", name: "Sass Jacqueline" },
{ workerID: "1003", name: "Barends Rachel Rosemari" },
{ workerID: "1005", name: "Van Wyk Leah" },
{ workerID: "1006", name: "De Bruin Mercia" },
{ workerID: "1008", name: "Van Wyk Jeandre" },
{ workerID: "1009", name: "Barnes Ansie" },
{ workerID: "1010", name: "Jackson Patricia" },
{ workerID: "1011", name: "De Bruin Anna" },
{ workerID: "1012", name: "Louw Karen" },
{ workerID: "1013", name: "Vis Christeline" },
{ workerID: "1015", name: "Sylvester Sandton" },
{ workerID: "1017", name: "Lottering Allyssia" },
{ workerID: "1023", name: "George Rozane" },
{ workerID: "1024", name: "Bruintjies Deidre Justine" },
{ workerID: "1027", name: "Vlotman Geraldine" },
{ workerID: "2022", name: "Apies Elvino Deon" },
{ workerID: "6006", name: "Rooi Lena" },
{ workerID: "6013", name: "Isaacs Jemone" },
{ workerID: "4003", name: "Shambare Precious" },
{ workerID: "4015", name: "Rore Caroline" },
{ workerID: "4016", name: "Zengwe Florence" },
{ workerID: "4017", name: "Chaibva Trace" },
{ workerID: "4020", name: "Sithole Rumbidzai" },
{ workerID: "4021", name: "Mariga Farirai" },
{ workerID: "4022", name: "Mushandu Sekayi" },
{ workerID: "4023", name: "Masimba Teurai" },
{ workerID: "4034", name: "Mereka Nomatter" },
{ workerID: "4037", name: "Muudzwa Enia" },
{ workerID: "4038", name: "Manjobo Irene" },
{ workerID: "4044", name: "Chitanda Mirica" },
{ workerID: "4047", name: "Tewende Abigirl" },
{ workerID: "4051", name: "Phiri Jane" },
{ workerID: "4057", name: "Chamisa Florence" },
{ workerID: "4060", name: "Sithole Ayanda" },
{ workerID: "4061", name: "Nyawaranda Tsitsi" },
{ workerID: "4062", name: "Musindo Ruth" },
{ workerID: "4102", name: "Kaitano Moleene" },
{ workerID: "4111", name: "Kurehwa Crecencia" },
{ workerID: "4115", name: "Muchacha Sibongile" },
{ workerID: "4116", name: "Badza Gamuchirai" },
{ workerID: "4117", name: "Matende Dorine" },
{ workerID: "4118", name: "Mutangadur Vanessa" },
{ workerID: "4120", name: "Chaibva Annie" },
{ workerID: "4121", name: "Mujeyi Yeukai Otilia" },
{ workerID: "4122", name: "Kamwendo Natasha Gremlin" },
{ workerID: "4145", name: "Mutetwa Eunice" },
{ workerID: "4149", name: "Phiri Agnes" },
{ workerID: "4150", name: "Mapolisa Chipo" },
{ workerID: "4151", name: "Makonese Molleen" },
{ workerID: "4152", name: "Chikago Theresa" },
{ workerID: "4153", name: "Ndlovu Tambudzai" },
{ workerID: "4154", name: "Chigwinya Naume" },
{ workerID: "4155", name: "Msidhani Alice" },
{ workerID: "4156", name: "Nyamadzave Temptation" },
{ workerID: "4157", name: "John Charity Monica" },
{ workerID: "4158", name: "Musorowego Runyararo" },
{ workerID: "4159", name: "Chiku Partial" },
{ workerID: "4160", name: "Takaendesa Mary" },
{ workerID: "4161", name: "Bhanhire Faustinah" },
{ workerID: "4162", name: "Kure Susan" },
{ workerID: "4163", name: "Moshoeshoe Ntheoleng Evodi" },
{ workerID: "4164", name: "Ntiisa Liteboho Alina" },
{ workerID: "4001", name: "Murandu Mebo" },
{ workerID: "4010", name: "Sande Ruth" },
{ workerID: "4011", name: "Chaibva Juliet" },
{ workerID: "4012", name: "Mbasera Susan" },
{ workerID: "4014", name: "Kanyinji Mildret" },
{ workerID: "4024", name: "Ngazimbi Wadzanayi" },
{ workerID: "4031", name: "Musiwa Shambadzirai" },
{ workerID: "4059", name: "Ngazimbi Nyembesi" },
{ workerID: "4070", name: "Chikoroond Jocyline" },
{ workerID: "4101", name: "Maphupho Siwiselo" },

];

// Helper functions
export const searchWorkers = (query: string): Worker[] => {
  if (!query) return WORKERS_DATA;
  
  const searchTerm = query.toUpperCase();
  return WORKERS_DATA.filter(worker => 
    worker.name.toUpperCase().includes(searchTerm) || 
    worker.workerID.includes(searchTerm)
  );
};

export const getWorkerById = (workerID: string): Worker | undefined => {
  return WORKERS_DATA.find(worker => worker.workerID === workerID);
};

export const getWorkerByName = (name: string): Worker | undefined => {
  return WORKERS_DATA.find(worker => 
    worker.name.toUpperCase() === name.toUpperCase()
  );
};
import type { EntityByStore, StoreName } from "@/domain/models";

/** Semilla comercial sintética, determinista y sin conexión con personas o negocios reales. */
const stamp = "2026-10-15T12:00:00.000Z";
const base = (id: string, createdAt = stamp) => ({ id, createdAt, updatedAt: stamp, status: "active" as const, demo: true as const });
const dateFor = (index: number) => {
  const month = new Date(Date.UTC(2026, 9 - (index % 12), 1 + ((index * 7) % 26), 13, 0));
  return month.toISOString();
};

const categories = [
  ["ROPA", "Ropa", "Prendas urbanas y casuales para toda la familia."],
  ["CALZADO", "Calzado", "Zapatillas y calzado casual de uso diario."],
  ["SANDALIAS", "Sandalias", "Sandalias y calzado ligero para temporada."],
  ["MOCHILAS", "Mochilas", "Mochilas escolares, urbanas y de viaje."],
  ["JUGUETES", "Juguetes", "Juguetes recreativos para distintas edades."],
  ["PELUCHES", "Peluches", "Peluches y personajes para regalo."],
  ["CARTERAS", "Carteras", "Carteras y bolsos de uso diario."],
  ["GORRAS", "Gorras", "Gorras urbanas y deportivas."],
  ["ACCESORIOS", "Accesorios", "Accesorios de moda y artículos complementarios."],
  ["HOGAR", "Hogar", "Artículos prácticos para el hogar y regalo."],
] as const;
const categoryRecords = categories.map(([code, name, description], index) => ({ ...base(`category-${index + 1}`), code: index === 0 ? "CAT-001" : `CAT-${code}`, name, description }));

const productFamilies = [
  ["Polera", 39, 10, 0], ["Zapatilla", 89, 10, 1], ["Sandalia", 35, 10, 2], ["Mochila", 59, 10, 3],
  ["Juego", 29, 10, 4], ["Peluche", 32, 10, 5], ["Cartera", 69, 10, 6], ["Gorra", 25, 10, 7],
  ["Accesorio", 18, 10, 8], ["Organizador", 24, 10, 9],
] as const;
const productAdjectives = ["urbana", "esencial", "juvenil", "premium", "clásica", "compacta", "deportiva", "con diseño", "acolchada", "artesanal"];
const products = productFamilies.flatMap(([family, price, count, categoryIndex]) => Array.from({ length: count }, (_, index) => ({
  ...base(categoryIndex === 0 && index === 0 ? "product-1" : `product-${categoryIndex + 1}-${index + 1}`), code: `PRD-${String(categoryIndex * 10 + index + 1).padStart(3, "0")}`,
  name: `${family} ${productAdjectives[index]}`, categoryId: categoryRecords[categoryIndex].id,
  description: `${family} de diseño ${productAdjectives[index]}, ideal para uso diario y regalo.`, unitPrice: price + (index % 5) * 7,
})));

const people = [
  ["Lucía", "Salazar Mendoza"], ["Mateo", "Quispe Huamán"], ["Valeria", "Paredes Ríos"], ["Sebastián", "Cárdenas Flores"], ["Camila", "Vargas Medina"], ["Diego", "Torres Castillo"], ["Renata", "Mendoza Aguilar"], ["Joaquín", "Soto Valdivia"], ["Alessandra", "Ponce Gutiérrez"], ["Nicolás", "Herrera Campos"], ["Daniela", "Vega Salinas"], ["Bruno", "Ramos Espinoza"], ["Mariana", "Chávez Núñez"], ["Gabriel", "Molina Cabrera"], ["Sofía", "Navarro León"], ["Andrés", "Fuentes Palomino"], ["Fiorella", "Cruz Benavides"], ["Rodrigo", "Márquez Rojas"], ["Paola", "Zegarra Soto"], ["Luis", "Carrillo Pacheco"], ["Micaela", "Valenzuela Díaz"], ["Álvaro", "Delgado Yupanqui"], ["Andrea", "Espinoza Cueva"], ["Héctor", "Paredes Loayza"], ["Natalia", "Cáceres León"], ["Santiago", "Gómez Tapia"], ["Patricia", "Ramos Villanueva"], ["Eduardo", "Salinas Bravo"], ["Carolina", "Rojas Huerta"], ["Martín", "Vílchez Medina"], ["Elena", "Mendoza Córdova"], ["Óscar", "Peña Valdez"], ["Teresa", "Luna Chávez"], ["Javier", "Reyes Condori"], ["Claudia", "Huerta Flores"], ["Marco", "Sánchez Poma"], ["Ariana", "Castro Quispe"], ["Fernando", "Vásquez Ríos"], ["Gabriela", "Núñez Paredes"], ["Renzo", "Alarcón Silva"], ["Mónica", "Gálvez Torres"], ["César", "Mamani Cárdenas"], ["Diana", "Ortega Salazar"], ["Piero", "Bendezú Ramírez"], ["Silvia", "Cornejo Vargas"], ["Iván", "Montalvo Ruiz"], ["Beatriz", "López Huamán"], ["Hugo", "Tello Cáceres"], ["Rocío", "Sarmiento Díaz"], ["Tomás", "Arce Valdivia"], ["Verónica", "Medina Soto"], ["Alonso", "Villanueva Cruz"], ["Karla", "Pacheco Gutiérrez"], ["Manuel", "Chávez Rojas"], ["Julieta", "Quispe Flores"], ["Cristian", "Soto Mendoza"], ["Isabel", "Vega Cárdenas"], ["Rafael", "Campos León"], ["Lorena", "Aguilar Ponce"], ["Emilio", "Valdivia Ramos"],
] as const;
const persons = people.map(([firstName, lastName], index) => ({ ...base(index === 0 ? "person-customer-1" : `person-${index + 1}`), documentType: "DNI" as const, documentNumber: index === 0 ? "00000001" : String(41000000 + index).padStart(8, "0"), firstName, lastName, email: `${firstName.toLocaleLowerCase("es")}.${lastName.split(" ")[0].toLocaleLowerCase("es")}@correo.pe`, phone: `9${String(81000000 + index).padStart(8, "0")}` }));
const companies = ["Comercial Andina SAC", "Corporación La Alameda EIRL", "Distribuidora Costa Sur SAC", "Inversiones Santa Rosa SAC", "Grupo Retail del Pacífico SAC", "Importaciones Valle Verde EIRL", "Servicios Educativos San Marcos SAC", "Constructora Los Cedros SAC", "Comercializadora El Sol SAC", "Bazar Mayorista Norte SAC", "Mercantil Las Palmeras SAC", "Asociación Cultural Lima Centro", "Librería y Bazar El Olivo SAC", "Textiles del Sur EIRL", "Corporación Nuevo Horizonte SAC", "Comercial Flores del Valle SAC", "Distribuciones San Miguel SAC", "Inversiones Miraflores SAC", "Mercados Unidos EIRL", "Grupo Familiar Santa Anita SAC"];
const companyRecords = companies.map((legalName, index) => ({ ...base(index === 0 ? "company-customer-2" : `company-${index + 1}`), ruc: index === 0 ? "20000000001" : `20${String(500000000 + index).padStart(9, "0")}`, legalName, tradeName: legalName.replace(/ SAC| EIRL/g, ""), email: `contacto${index + 1}@empresa.pe`, phone: `(01) ${String(4201000 + index).padStart(7, "0")}` }));
const customers = [...persons.map((person, index) => ({ ...base(index === 0 ? "customer-1" : `customer-person-${index + 1}`), kind: "person" as const, personId: person.id })), ...companyRecords.map((company, index) => ({ ...base(index === 0 ? "customer-2" : `customer-company-${index + 1}`), kind: "company" as const, companyId: company.id }))];

const branchData = [["SUC-001", "Arimana Centro", "Jirón de la Unión 842, Cercado de Lima", "(01) 426-1820"], ["SUC-002", "Arimana Miraflores", "Av. Larco 1150, Miraflores", "(01) 445-2630"], ["SUC-003", "Arimana Arequipa", "Calle Mercaderes 318, Arequipa", "(054) 284-610"], ["SUC-004", "Arimana Trujillo", "Jirón Independencia 725, Trujillo", "(044) 291-740"]] as const;
const branches = branchData.map(([code, name, address, phone], index) => ({ ...base(`branch-${index + 1}`), code, name, address, phone }));
const sellerNames = ["María Fernanda Torres", "Carlos Ramírez Huamán", "Jimena Valdivia Soto", "Luis Alberto Cárdenas", "Ana Lucía Paredes", "Jorge Salinas Flores", "Mónica Rojas Mendoza", "Diego Vásquez León", "Patricia Gutiérrez Campos", "Renato Quispe Díaz", "Claudia Espinoza Ríos", "Fernando Castillo Vega"];
const sellers = sellerNames.map((name, index) => ({ ...base(`seller-${index + 1}`), documentType: "DNI" as const, documentNumber: index === 0 ? "00000002" : String(70000000 + index).padStart(8, "0"), name, branchId: branches[index % branches.length].id, email: `vendedor${index + 1}@arimana.pe`, phone: `9${String(92000000 + index).padStart(8, "0")}`, userId: index === 0 ? "user-seller" : undefined }));
const paymentMethods = [["Efectivo", "Pago en efectivo en caja."], ["Tarjeta de débito", "Pago con tarjeta de débito."], ["Tarjeta de crédito", "Pago con tarjeta de crédito."], ["Yape", "Pago digital mediante Yape."], ["Plin", "Pago digital mediante Plin."]] .map(([name, description], index) => ({ ...base(index === 0 ? "payment-cash" : index === 1 ? "payment-card" : `payment-${index + 1}`), name, description }));

const geography = [
  ["15", "Lima", "1501", "Lima", [["150101", "Cercado de Lima"], ["150122", "Miraflores"], ["150131", "San Isidro"], ["150140", "Santiago de Surco"]]],
  ["04", "Arequipa", "0401", "Arequipa", [["040101", "Arequipa"], ["040105", "Cayma"], ["040108", "José Luis Bustamante y Rivero"]]],
  ["13", "La Libertad", "1301", "Trujillo", [["130101", "Trujillo"], ["130102", "El Porvenir"], ["130105", "La Esperanza"]]],
  ["08", "Cusco", "0801", "Cusco", [["080101", "Cusco"], ["080104", "San Sebastián"], ["080105", "Santiago"]]],
] as const;
const departments = geography.map(([code, name], index) => ({ ...base(index === 0 ? "department-lima" : `department-${code}`), code, name }));
const provinces = geography.map(([departmentCode, , provinceCode, name], index) => ({ ...base(index === 0 ? "province-lima" : `province-${provinceCode}`), code: provinceCode, name, departmentId: index === 0 ? "department-lima" : `department-${departmentCode}` }));
const districts = geography.flatMap(([, , provinceCode, , districtList], geographyIndex) => districtList.map(([code, name], index) => ({ ...base(geographyIndex === 0 && index === 1 ? "district-miraflores" : `district-${code}`), code, name, provinceId: geographyIndex === 0 ? "province-lima" : `province-${provinceCode}` })));

const sales = Array.from({ length: 250 }, (_, index) => {
  const state = index < 220 ? "confirmed" as const : index < 235 ? "voided" as const : "draft" as const;
  const lineCount = 2 + (index % 3);
  const lines = Array.from({ length: lineCount }, (_, lineIndex) => {
    const product = products[(index * 7 + lineIndex * 13) % products.length];
    const quantity = 1 + ((index + lineIndex) % 3);
    return { id: `sale-${index + 1}-line-${lineIndex + 1}`, productId: product.id, productCode: product.code, productName: product.name, quantity, unitPrice: product.unitPrice, subtotal: product.unitPrice * quantity };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const location = geography[index % geography.length];
  const district = location[4][index % location[4].length];
  const geographyIndex = index % geography.length;
  return { ...base(`sale-${index + 1}`, dateFor(index)), saleNumber: `V-${String(index + 1).padStart(6, "0")}`, customerId: customers[(index * 3) % customers.length].id, sellerId: sellers[index % sellers.length].id, branchId: branches[index % branches.length].id, lines, subtotal, total: subtotal, state, saleDate: dateFor(index), paymentMethodId: paymentMethods[index % paymentMethods.length].id, departmentId: geographyIndex === 0 ? "department-lima" : `department-${location[0]}`, provinceId: geographyIndex === 0 ? "province-lima" : `province-${location[2]}`, districtId: geographyIndex === 0 && index % location[4].length === 1 ? "district-miraflores" : `district-${district[0]}`, createdBy: index % 2 ? "user-seller" : "user-admin" };
});
const receipts = sales.filter(sale => sale.state !== "draft").map((sale, index) => ({ ...base(`receipt-${sale.id}`, sale.saleDate), saleId: sale.id, type: index % 4 === 0 ? "Factura" as const : "Boleta" as const, series: index % 4 === 0 ? "F001" : "B001", number: String(index + 1).padStart(6, "0"), state: sale.state === "voided" ? "voided" as const : "issued" as const, issuedAt: sale.state === "voided" ? undefined : sale.saleDate, voidedAt: sale.state === "voided" ? sale.saleDate : undefined }));
const salesWithReceipts = sales.map(sale => { const receipt = receipts.find(item => item.saleId === sale.id); return receipt ? { ...sale, receiptId: receipt.id } : sale; });
const users = [
  { ...base("user-admin"), username: "admin.arimana", displayName: "Alejandro Salazar Mendoza", role: "Administrador" as const, email: "alejandro.salazar@arimana.pe" },
  { ...base("user-seller"), username: "vendedor.arimana", displayName: "María Fernanda Torres", role: "Vendedor" as const, employeeId: "seller-1", email: "maria.torres@arimana.pe" },
  { ...base("user-cashier"), username: "cajero.arimana", displayName: "Carlos Ramírez Huamán", role: "Cajero" as const, employeeId: "seller-2", email: "carlos.ramirez@arimana.pe" },
  { ...base("user-manager"), username: "gerencia.arimana", displayName: "Patricia Gutiérrez Campos", role: "Gerencia" as const, email: "patricia.gutierrez@arimana.pe" },
  { ...base("user-analyst"), username: "analista.arimana", displayName: "Renata Mendoza Aguilar", role: "Analista" as const, email: "renata.mendoza@arimana.pe" },
];

export const DEMO_DATA: { [K in StoreName]: EntityByStore[K][] } = {
  users, customers, persons, companies: companyRecords, categories: categoryRecords, products, branches, sellers, paymentMethods, sales: salesWithReceipts, receipts,
  departments, provinces, districts, etlConnections: [], etlExecutions: [], auditLogs: [], consolidatedRows: [],
};

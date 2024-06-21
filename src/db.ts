import { PrismaClient, Prisma } from "@prisma/client";
import { ProductValidation } from "@/models/product";

const db = new PrismaClient().$extends(ProductValidation);
export default db;

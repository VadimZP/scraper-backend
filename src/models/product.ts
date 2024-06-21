import { z } from "zod";
import { Prisma } from "@prisma/client";

export const ProductCreateInput = z.object({
  title: z.string(),
  category: z.string(),
});

export const ProductValidation = Prisma.defineExtension({
  query: {
    product: {
      create({ args, query }) {
        args.data = ProductCreateInput.parse(args.data);
        return query(args);
      },
    },
  },
});

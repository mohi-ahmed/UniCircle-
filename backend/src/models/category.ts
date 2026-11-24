import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const categorySchema = new mongoose.Schema({
  code: { type: String, required: true, immutable: true, trim: true },
  name: { type: String, required: true, immutable: true, trim: true },
}, {
  collection: 'categories',
  strict: 'throw',
  versionKey: false,
});

export type CategoryDocument = InferSchemaType<typeof categorySchema>;
export const Category = (mongoose.models.Category as Model<CategoryDocument> | undefined)
  ?? mongoose.model<CategoryDocument>('Category', categorySchema);

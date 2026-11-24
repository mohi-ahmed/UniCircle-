import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const universitySettingsSchema = new mongoose.Schema({
  _id: { type: String, required: true, immutable: true },
  universityName: { type: String, required: true, trim: true, minlength: 2, maxlength: 200 },
  campusTimeZone: { type: String, required: true, enum: ['Asia/Dhaka'] },
}, {
  collection: 'universitySettings',
  strict: 'throw',
  timestamps: { createdAt: false, updatedAt: true },
  versionKey: false,
});

export type UniversitySettingsDocument = InferSchemaType<typeof universitySettingsSchema>;
export const UniversitySettings = (mongoose.models.UniversitySettings as Model<UniversitySettingsDocument> | undefined)
  ?? mongoose.model<UniversitySettingsDocument>('UniversitySettings', universitySettingsSchema);

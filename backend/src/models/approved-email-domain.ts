import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const approvedEmailDomainSchema = new mongoose.Schema({
  domain: { type: String, required: true, lowercase: true, trim: true },
  isActive: { type: Boolean, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
}, {
  collection: 'approvedEmailDomains',
  strict: 'throw',
  timestamps: true,
  versionKey: false,
});

export type ApprovedEmailDomainDocument = InferSchemaType<typeof approvedEmailDomainSchema>;
export const ApprovedEmailDomain = (mongoose.models.ApprovedEmailDomain as Model<ApprovedEmailDomainDocument> | undefined)
  ?? mongoose.model<ApprovedEmailDomainDocument>('ApprovedEmailDomain', approvedEmailDomainSchema);

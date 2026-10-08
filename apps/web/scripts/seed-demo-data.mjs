import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The demo seeder is disabled in production.');
}

const displayName = process.env.MOGUL_SEED_NAME?.trim() || 'Mogul Test';
const username = (
  process.env.MOGUL_SEED_USERNAME?.trim() || 'MogulTest'
).toLowerCase();
const email = (
  process.env.MOGUL_SEED_EMAIL?.trim() || 'mogualtest@mogul.com'
).toLowerCase();
const password = process.env.MOGUL_SEED_PASSWORD;

if (!password || password.length < 10 || password.length > 128) {
  throw new Error(
    'Set MOGUL_SEED_PASSWORD to a password between 10 and 128 characters.',
  );
}

if (displayName.length < 2 || displayName.length > 80) {
  throw new Error('MOGUL_SEED_NAME must be between 2 and 80 characters.');
}

if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
  throw new Error(
    'MOGUL_SEED_USERNAME must be 3–32 letters, numbers, dots, dashes, or underscores.',
  );
}

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('MOGUL_SEED_EMAIL must be a valid email address.');
}

const mongoUri =
  process.env.MONGODB_URI ??
  process.env.MONGO_URI ??
  'mongodb://127.0.0.1:27017/mogul_db';

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 32,
    },
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

const PropertySchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    title: { type: String, required: true },
    address: { type: String, required: true },
    status: {
      type: String,
      enum: ['ACQUISITION', 'LAUNCH', 'ACTIVE', 'MAINTENANCE'],
      required: true,
      default: 'ACQUISITION',
    },
    purchasePrice: { type: Number, required: true },
    targetYieldPercentage: { type: Number, required: true },
    totalInvestorsCount: { type: Number, default: 0 },
    taxMetadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

const User = mongoose.models.User ?? mongoose.model('User', UserSchema);
const Property =
  mongoose.models.Property ?? mongoose.model('Property', PropertySchema);

const demoProperties = [
  {
    title: 'Brooklyn Heights Residential Unit',
    address: '142 Joralemon St, Brooklyn, NY',
    status: 'ACTIVE',
    purchasePrice: 1250000,
    targetYieldPercentage: 8.4,
    totalInvestorsCount: 0,
    taxMetadata: {
      depreciationScheduleYears: 27.5,
      annualDepreciationUSD: 45454.55,
      k1GeneratedCount: 0,
    },
  },
  {
    title: 'Manhattan West Side Portfolio',
    address: '410 W 42nd St, New York, NY',
    status: 'LAUNCH',
    purchasePrice: 3100000,
    targetYieldPercentage: 7.9,
    totalInvestorsCount: 0,
    taxMetadata: {
      depreciationScheduleYears: 27.5,
      annualDepreciationUSD: 112727.27,
      k1GeneratedCount: 0,
    },
  },
];

async function seedDemoData() {
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  } catch {
    throw new Error(
      'Could not connect to MongoDB. Start MongoDB and check MONGO_URI.',
    );
  }

  try {
    await User.init();
    const existingUser = await User.findOne({
      $or: [{ username }, { email }],
    });

    if (
      existingUser &&
      (existingUser.username !== username || existingUser.email !== email)
    ) {
      throw new Error(
        'The demo username or email already belongs to a different account.',
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = existingUser
      ? await User.findByIdAndUpdate(
          existingUser._id,
          { $set: { displayName, username, email, passwordHash } },
          { new: true, runValidators: true },
        )
      : await User.create({ displayName, username, email, passwordHash });

    if (!user) throw new Error('Could not create the demo account.');

    await Promise.all(
      demoProperties.map((property) =>
        Property.updateOne(
          { ownerId: user._id, title: property.title },
          { $set: { ...property, ownerId: user._id } },
          { upsert: true, runValidators: true },
        ),
      ),
    );

    console.log(`Demo account ready for ${displayName} (@${username}).`);
    console.log(`Seeded ${demoProperties.length} properties for this account.`);
    console.log(
      'The password was read from MOGUL_SEED_PASSWORD and was not printed.',
    );
  } finally {
    await mongoose.disconnect();
  }
}

seedDemoData().catch((error) => {
  console.error(
    error instanceof Error ? error.message : 'Demo data seeding failed.',
  );
  process.exitCode = 1;
});

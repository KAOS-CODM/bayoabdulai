import('./server/config/db.js').then(({connectDb}) => {
  return connectDb({mongoUri: process.env.MONGODB_URI, mongoDbName: process.env.MONGODB_DB_NAME});
}).then(() => {
  console.log('Database connected');
  return import('./server/models/Project.js');
}).then(({default: Project}) => {
  (async () => {
    try {
      const existing = await Project.findOne({slug: 'career-ontrack-ai'}).lean();
      if (!existing) {
        console.log('Creating CareerOnTrack AI...');
        await new Project({
          title: 'CareerOnTrack AI',
          slug: 'career-ontrack-ai',
          shortDescription: 'An AI-powered career platform',
          category: 'AI Product Design',
          status: 'draft',
        }).save();
        console.log('Created: career-ontrack-ai - status: draft');
      } else {
        console.log('Record already exists: career-ontrack-ai - skipping');
      }
      process.exit(0);
    } catch (err) {
      console.error('Error:', err.message.substring(0, 300));
      process.exit(1);
    }
  })();
}).catch(err => {
  console.error('Error:', err.message.substring(0, 300));
  process.exit(1);
});
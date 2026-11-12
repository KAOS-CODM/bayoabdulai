import('./server/config/db.js').then(({connectDb}) => {
  return connectDb({mongoUri: process.env.MONGODB_URI, mongoDbName: process.env.MONGODB_DB_NAME});
}).then(() => {
  console.log('Database connected');
  return import('./server/models/Project.js');
}).then(({default: Project}) => {
  (async () => {
    try {
      const existing = await Project.findOne({slug: 'nicn-redesign'}).lean();
      if (!existing) {
        console.log('Creating NICN Website Redesign...');
        await new Project({
          title: 'NICN Website Redesign',
          slug: 'nicn-redesign',
          shortDescription: 'Redesigned the official website of the National Industrial Court of Nigeria',
          category: 'Government Services',
          status: 'draft',
        }).save();
        console.log('Created: nicn-redesign - status: draft');
      } else {
        console.log('Record already exists: nicn-redesign - skipping');
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
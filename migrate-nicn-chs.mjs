import('./server/config/db.js').then(({connectDb}) => {
  return connectDb({mongoUri: process.env.MONGODB_URI, mongoDbName: process.env.MONGODB_DB_NAME});
}).then(() => {
  console.log('Database connected');
  return import('./server/models/Project.js');
}).then(({default: Project}) => {
  (async () => {
    try {
      const existing = await Project.findOne({slug: 'nicn-clinic-his'}).lean();
      if (!existing) {
        console.log('Creating NICN Clinic HIS...');
        await new Project({
          title: 'NICN Clinic HIS',
          slug: 'nicn-clinic-his',
          shortDescription: 'A comprehensive Hospital Information System',
          category: 'Healthcare Product',
          status: 'draft',
        }).save();
        console.log('Created: nicn-clinic-his - status: draft');
      } else {
        console.log('Record already exists: nicn-clinic-his - skipping');
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
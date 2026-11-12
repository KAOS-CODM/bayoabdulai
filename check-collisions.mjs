import('./server/config/db.js').then(({ connectDb, disconnectDb }) => {
  return connectDb({ 
    mongoUri: process.env.MONGODB_URI, 
    mongoDbName: process.env.MONGODB_DB_NAME,
    log: { log: () => {}, warn: () => {}, error: () => {} } 
  });
}).then(() => {
  console.log('Database connected');
  import('./server/models/Project.js').then(({ default: Project }) => {
    return Project.find({ slug: { \$in: ['fast-food-delivery-app', 'nicn-clinic-his', 'nicn-redesign', 'career-ontrack-ai'] } }).lean();
  }).then(existing => {
    console.log('Existing migration slugs:', existing.length > 0 ? existing.map(x => x.slug) : 'None');
    if (existing.length > 0) {
      console.log('COLLISION - These slugs already exist, cannot overwrite:');
      existing.forEach(x => console.log(' -', x.slug, '|', x.title));
    } else {
      console.log('No collisions - all four slugs are available for migration');
    }
    disconnectDb();
    process.exit(0);
  }).catch(err => {
    console.log('Error finding projects:', err.message.substring(0, 200));
    disconnectDb();
    process.exit(1);
  });
}).catch(err => {
  console.log('Error connecting to DB:', err.message.substring(0, 200));
  process.exit(1);
});
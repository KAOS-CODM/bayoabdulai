import('./server/config/db.js').then(({connectDb}) => {
  return connectDb({mongoUri: process.env.MONGODB_URI, mongoDbName: process.env.MONGODB_DB_NAME});
}).then(() => {
  console.log('Database connected');
  return import('./server/models/Project.js');
}).then(({default: Project}) => {
  return Project.findOne({slug: 'fast-food-delivery-app'}).lean();
}).then(existing => {
  if (!existing) {
    console.log('Creating Fast Food Delivery App...');
    return new Project({
      title: 'Fast Food Delivery App',
      slug: 'fast-food-delivery-app',
      shortDescription: 'A seamless food ordering experience',
      category: 'Web Design',
      status: 'draft',
    }).save();
  } else {
    console.log('Record already exists: fast-food-delivery-app - skipping');
    process.exit(0);
  }
}).then(saved => {
  console.log('Created: fast-food-delivery-app - status:', saved.status);
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message.substring(0, 300));
  process.exit(1);
});
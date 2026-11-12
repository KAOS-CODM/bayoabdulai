import('./server/config/db.js').then(({connectDb}) => {
  return connectDb({mongoUri: process.env.MONGODB_URI, mongoDbName: process.env.MONGODB_DB_NAME, log: {log: () => {}, warn: () => {}, error: () => {}}});
}).then(() => {
  console.log('Database connected');
  return import('./server/models/Project.js');
}).then(({default: Project}) => {
  // Check and create Fast Food Delivery App
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
      displayOrder: 0,
      tags: ['Mobile Product Design', 'UX Research'],
      role: 'UI/UX Designer',
      duration: '',
      objectives: ['Make food discovery quick and effortless', 'Simplify the ordering and checkout process', 'Provide real-time order tracking'],
      overview: [{type: 'paragraph', content: 'The goal of this project was to design a user-friendly, fast and trustworthy food delivery app that simplifies the ordering process while providing a delightful experience from browsing to delivery.'}],
      sections: [{type: 'richText', title: 'Research', blocks: [{type: 'paragraph', content: 'I used both qualitative and quantitative methods to understand users, their needs and frustrations.'}, {type: 'list', ordered: false, items: ['User Interviews', 'Online Surveys', 'Competitor Analysis']}]},
      media: [{url: '/assets/images/fast-food-delivery-app/hero.png', alt: 'Fast Food Delivery App screens', ratio: '16:10', sort: 0}],
      links: [{label: 'View Prototype', url: 'https://www.figma.com/proto/2ct4qyIZXG1a0Q4hZdR8iJ/Fast-Food?node-id=1-2&p=f&t=CDLG9il0Z6UKCRXq-1&scaling=min-zoom&content-scaling=fixed&page-id=0%3A1&starting-point-node-id=1%3A2', kind: 'prototype'}],
      seo: {title: '', description: '', canonical: '', image: '', imageAlt: ''}
    }).save();
  } else {
    console.log('Record already exists: fast-food-delivery-app - skipping');
  }
}).then(saved => {
  if (saved) {
    console.log('Created: fast-food-delivery-app - status:', saved.status);
  }
  // Create NICN Clinic HIS
  return Project.findOne({slug: 'nicn-clinic-his'}).lean();
}).then(existing => {
  if (!existing) {
    console.log('Creating NICN Clinic HIS...');
    return new Project({
      title: 'NICN Clinic HIS',
      slug: 'nicn-clinic-his',
      shortDescription: 'A comprehensive Hospital Information System',
      category: 'Healthcare Product',
      status: 'draft',
      displayOrder: 0,
      tags: ['Healthcare Product', 'Complex Workflow', 'Dashboard', 'Enterprise UX'],
      role: 'UI/UX Designer',
      duration: '12 Weeks',
      tools: ['Figma', 'FigJam', 'Notion', 'Lucidchart'],
      objectives: ['Quick patient history access', 'Dashboard metrics', 'Workflow automation', 'Integrated modules', 'Scalable system'],
      overview: [{type: 'paragraph', content: 'A comprehensive Hospital Information System designed for NICN Clinic to manage patient data appointments, consultations, lab, pharmacy and reports in one secure platform.'}],
      sections: [{type: 'richText', title: 'Research', blocks: [{type: 'paragraph', content: 'I used both qualitative and quantitative methods to understand users, their needs and frustrations.'}, {type: 'list', ordered: false, items: ['User Interviews', 'Online Surveys', 'Workflow Analysis', 'Observation']}]},
      media: [{url: '/assets/images/nicn-clinic-his/dashboard-hero.png', alt: 'NICN Clinic HIS dashboard', ratio: '16:10', sort: 0}],
      links: [{label: 'View Prototype', url: 'https://www.figma.com/proto/s1sDkFB7vadMt2WxSMMQzU/NICN-CLINIC-NEW?node-id=99-7&t=RZ0zEuNadzBzXS4N-1&scaling=min-zoom&content-scaling=fixed&page-id=0%3A1&starting-point-node-id=99%3A7', kind: 'prototype'}],
      seo: {title: '', description: '', canonical: '', image: '', imageAlt: ''}
    }).save();
  } else {
    console.log('Record already exists: nicn-clinic-his - skipping');
  }
}).then(saved => {
  if (saved) {
    console.log('Created: nicn-clinic-his - status:', saved.status);
  }
  // Create NICN Website Redesign
  return Project.findOne({slug: 'nicn-redesign'}).lean();
}).then(existing => {
  if (!existing) {
    console.log('Creating NICN Website Redesign...');
    return new Project({
      title: 'NICN Website Redesign',
      slug: 'nicn-redesign',
      shortDescription: 'Redesigned the official website of the National Industrial Court of Nigeria',
      category: 'Government Services',
      status: 'draft',
      displayOrder: 0,
      tags: ['Government / Public Service', 'Information Architecture', 'Responsive Web Design', 'Accessibility'],
      role: 'UX/UI Designer',
      duration: '8 Weeks',
      tools: ['Figma', 'FigJam', 'Photoshop', 'WAVE'],
      objectives: ['Make information easy to understand', 'Improve accessibility and readability', 'Create responsive experience across all devices', 'Highlight key services and resources', 'Build trust and credibility through design'],
      overview: [{type: 'paragraph', content: 'Redesigned the official website of the National Industrial Court of Nigeria with improved usability, information architecture and user experience for all stakeholders.'}],
      sections: [{type: 'richText', title: 'Research', blocks: [{type: 'paragraph', content: 'I used both qualitative and quantitative methods to understand users, their needs and frustrations.'}, {type: 'list', ordered: false, items: ['User Interviews', 'Heuristic Reviews', 'Online Surveys', 'Competitive Analysis']}]},
      media: [{url: '/assets/images/nicn-redesign/hero.png', alt: 'NICN Website Redesign homepage', ratio: '16:10', sort: 0}],
      links: [{label: 'View Prototype', url: 'https://www.figma.com/proto/gM38PvVpytTbH57wrcMvPw/NICN?node-id=2-27&p=f&t=pKX2YU7oI0pRbJbN-1&scaling=min-zoom&content-scaling=fixed&page-id=0%3A1&starting-point-node-id=2%3A27', kind: 'prototype'}],
      seo: {title: '', description: '', canonical: '', image: '', imageAlt: ''}
    }).save();
  } else {
    console.log('Record already exists: nicn-redesign - skipping');
  }
}).then(saved => {
  if (saved) {
    console.log('Created: nicn-redesign - status:', saved.status);
  }
  // Create CareerOnTrack AI
  return Project.findOne({slug: 'career-ontrack-ai'}).lean();
}).then(existing => {
  if (!existing) {
    console.log('Creating CareerOnTrack AI...');
    return new Project({
      title: 'CareerOnTrack AI',
      slug: 'career-ontrack-ai',
      shortDescription: 'An AI-powered career platform',
      category: 'AI Product Design',
      status: 'draft',
      displayOrder: 0,
      tags: ['AI Product', 'Dashboard', 'Personalization', 'Web Application'],
      role: 'UI/UX Designer',
      duration: '10 Weeks',
      tools: ['Figma', 'FigJam', 'Notion', 'AI ChatGPT'],
      objectives: ['AI-powered recommendations', 'Skills tracking', 'Intuitive dashboards', 'Personalized experience'],
      overview: [{type: 'paragraph', content: 'An AI-powered career platform that helps users discover opportunities, build skills, and track their career growth with personalized recommendations.'}],
      sections: [{type: 'richText', title: 'Research', blocks: [{type: 'paragraph', content: 'I used both qualitative and quantitative methods to understand users, their needs and frustrations.'}, {type: 'list', ordered: false, items: ['User Interviews', 'Online Surveys', 'Competitor Analysis']}]},
      media: [{url: '/assets/images/career-ontrack-ai/project-2.png', alt: 'CareerOnTrack AI Dashboard', ratio: '16:10', sort: 0}],
      links: [{label: 'View Prototype', url: 'https://www.figma.com/proto/bWR1YmGEzHDgOPBlQlryLY/my-ai-work?node-id=0-24&t=DCb7I5KBvwqO5S7N-1&scaling=min-zoom&content-scaling=fixed&page-id=0%3A1', kind: 'prototype'}],
      seo: {title: '', description: '', canonical: '', image: '', imageAlt: ''}
    }).save();
  } else {
    console.log('Record already exists: career-ontrack-ai - skipping');
  }
}).then(saved => {
  if (saved) {
    console.log('Created: career-ontrack-ai - status:', saved.status);
  }
  console.log('Migration complete');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message.substring(0, 300));
  process.exit(1);
});
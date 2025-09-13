import { type Kysely, sql } from 'kysely';
import { hashPassword } from '../../common/helpers';

export async function up(db: Kysely<any>): Promise<void> {
  // Check if any workspace exists
  const workspace = await db
    .selectFrom('workspaces')
    .select('id')
    .limit(1)
    .executeTakeFirst();
  
  if (!workspace) {
    // Create default workspace
    const newWorkspace = await db
      .insertInto('workspaces')
      .values({
        name: 'Default Workspace',
        hostname: null,
      })
      .returning('id')
      .executeTakeFirst();
    
    if (newWorkspace) {
      // Create default admin user
      const hashedPassword = await hashPassword('admin');
      
      const adminUser = await db
        .insertInto('users')
        .values({
          email: 'admin@docmost.local',
          name: 'admin',
          password: hashedPassword,
          role: 'owner',
          workspace_id: newWorkspace.id,
          email_verified_at: new Date(),
        })
        .returning('id')
        .executeTakeFirst();
      
      if (adminUser) {
        
        // Create default group if it doesn't exist
        const defaultGroup = await db
          .selectFrom('groups')
          .select('id')
          .where('workspace_id', '=', newWorkspace.id)
          .where('is_default', '=', true)
          .executeTakeFirst();
        
        if (!defaultGroup) {
          const newGroup = await db
            .insertInto('groups')
            .values({
              name: 'Default',
              description: 'Default group for all users',
              workspace_id: newWorkspace.id,
              is_default: true,
            })
            .returning('id')
            .executeTakeFirst();
          
          if (newGroup) {
            // Add admin to default group
            await db
              .insertInto('group_users')
              .values({
                group_id: newGroup.id,
                user_id: adminUser.id,
              })
              .execute();
          }
        }
        
        console.log('Default admin user created:');
        console.log('Email: admin@docmost.local');
        console.log('Password: admin');
      }
    }
  } else {
    // Check if admin user already exists in any workspace
    const adminExists = await db
      .selectFrom('users')
      .select('id')
      .where('email', '=', 'admin@docmost.local')
      .executeTakeFirst();
    
    if (!adminExists) {
      // Get the first workspace
      const firstWorkspace = await db
        .selectFrom('workspaces')
        .select('id')
        .orderBy('created_at', 'asc')
        .limit(1)
        .executeTakeFirst();
      
      if (firstWorkspace) {
        // Create default admin user
        const hashedPassword = await hashPassword('admin');
        
        const adminUser = await db
          .insertInto('users')
          .values({
            email: 'admin@docmost.local',
            name: 'admin',
            password: hashedPassword,
            role: 'owner',
            workspace_id: firstWorkspace.id,
            email_verified_at: new Date(),
          })
          .returning('id')
          .executeTakeFirst();
        
        if (adminUser) {
          
          // Add to default group if exists
          const defaultGroup = await db
            .selectFrom('groups')
            .select('id')
            .where('workspace_id', '=', firstWorkspace.id)
            .where('is_default', '=', true)
            .executeTakeFirst();
          
          if (defaultGroup) {
            await db
              .insertInto('group_users')
              .values({
                group_id: defaultGroup.id,
                user_id: adminUser.id,
              })
              .execute();
          }
          
          console.log('Default admin user created:');
          console.log('Email: admin@docmost.local');
          console.log('Password: admin');
        }
      }
    }
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  // Remove default admin user
  await db
    .deleteFrom('users')
    .where('email', '=', 'admin@docmost.local')
    .execute();
}

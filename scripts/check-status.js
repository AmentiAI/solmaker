const {neon}=require('@neondatabase/serverless')
const sql=neon(process.env.NEON_DATABASE || process.env.DATABASE_URL)
const id = process.argv[2] || '39896e32-86d3-4a1d-a083-be0a2c56c652'
sql`SELECT collection_status, candy_machine_address, deployment_status, metadata_uploaded FROM collections WHERE id=${id}::uuid`
  .then(r => console.log(JSON.stringify(r, null, 2)))
  .catch(e => console.error(e))

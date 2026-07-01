import Dexie, { type Table } from 'dexie'

export type OutboxOp = 'create' | 'patch' | 'delete'
export type OutboxStatus = 'pending' | 'syncing' | 'failed'

export interface OutboxEntry {
  id: string                // catch UUID (client-generated for 'create')
  op: OutboxOp
  status: OutboxStatus
  payload?: Record<string, unknown>   // form fields, for create/patch
  editToken?: string                  // required for patch/delete
  pendingPhotos?: Blob[]              // unsent photo blobs (create/patch only)
  uploadedPhotoUrls?: string[]        // photos already uploaded this entry
  attempts: number
  lastError?: string
  createdAt: number
}

export interface CachedReportsRow {
  id: 'latest'
  rows: Record<string, unknown>[]
  fetchedAt: number
}

class EdjaDB extends Dexie {
  outbox!: Table<OutboxEntry, string>
  reportsCache!: Table<CachedReportsRow, string>

  constructor() {
    super('edja-db')
    this.version(1).stores({
      outbox: 'id, status',
      reportsCache: 'id',
    })
  }
}

export const db = new EdjaDB()

export interface TransactionRecord {
  id: string
  user_alias: string
  payment_id: string
  blockchain_hash: string | null
  sender_address: string
  recipient_address: string
  token_address: string
  amount: string
  fee: string
  direction: 'incoming' | 'outgoing'
  status: string
  recorded_at: Date
}

export interface ActivityItem {
  amount: string
  fee: string
  direction: 'incoming' | 'outgoing'
  alias: string | null
  status: string
  recordedAt: Date
}
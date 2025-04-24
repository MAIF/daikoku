interface IMessageType {
  type: 'tenant',
  value: string
}

export type IMessage = {
  _id: string,
  _tenant: string,
  messageType: IMessageType,
  chat: string,
  date: number,
  sender: string,
  participants: Array<string>,
  readBy: Array<string>,
  message: String,
  closed?: Date,
  send: Boolean
}

export type IChatClosedDate = { chat: string, date: number }

export type IChatInfo = {
  messages: Array<IMessage>
  previousClosedDates: Array<IChatClosedDate>
}
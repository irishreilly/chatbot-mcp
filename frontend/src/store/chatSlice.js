import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  conversations: {},
  currentConversationId: null,
  isLoading: false,
  error: null,
}

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    setCurrentConversation: (state, action) => {
      state.currentConversationId = action.payload
    },
    addMessage: (state, action) => {
      const { conversationId, message } = action.payload
      if (!state.conversations[conversationId]) {
        state.conversations[conversationId] = {
          id: conversationId,
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      }
      state.conversations[conversationId].messages.push(message)
      state.conversations[conversationId].updatedAt = new Date().toISOString()
    },
    setLoading: (state, action) => {
      state.isLoading = action.payload
    },
    setError: (state, action) => {
      state.error = action.payload
    },
    clearError: (state) => {
      state.error = null
    },
  },
})

export const {
  setCurrentConversation,
  addMessage,
  setLoading,
  setError,
  clearError,
} = chatSlice.actions

export default chatSlice.reducer
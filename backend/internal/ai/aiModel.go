package ai

import (
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

const (
	roleUser      = "user"
	roleAssistant = "assistant"

	sourceUser      = "user"
	sourceKnowledge = "knowledge"
	sourceGemini    = "gemini"
)

type Conversation struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Message struct {
	ID             string    `json:"id"`
	ConversationID string    `json:"conversation_id"`
	Role           string    `json:"role"`
	Content        string    `json:"content"`
	Source         string    `json:"source"`
	CreatedAt      time.Time `json:"created_at"`
}

type SendMessageRequest struct {
	ConversationID string `json:"conversation_id"`
	Message        string `json:"message"`
}

type ChatsResponse struct {
	Chats []Conversation `json:"chats"`
}

type MessagesResponse struct {
	Messages []Message `json:"messages"`
}

type DeleteResponse struct {
	Deleted bool `json:"deleted"`
}

type conversationDocument struct {
	ID        bson.ObjectID `bson:"_id,omitempty"`
	UserID    bson.ObjectID `bson:"user_id"`
	Title     string        `bson:"title"`
	CreatedAt time.Time     `bson:"created_at"`
	UpdatedAt time.Time     `bson:"updated_at"`
}

type messageDocument struct {
	ID             bson.ObjectID `bson:"_id,omitempty"`
	ConversationID bson.ObjectID `bson:"conversation_id"`
	UserID         bson.ObjectID `bson:"user_id"`
	Role           string        `bson:"role"`
	Content        string        `bson:"content"`
	Source         string        `bson:"source"`
	CreatedAt      time.Time     `bson:"created_at"`
}

func conversationResponse(
	document conversationDocument,
) Conversation {
	return Conversation{
		ID:        document.ID.Hex(),
		Title:     document.Title,
		CreatedAt: document.CreatedAt,
		UpdatedAt: document.UpdatedAt,
	}
}

func messageResponse(
	document messageDocument,
) Message {
	return Message{
		ID:             document.ID.Hex(),
		ConversationID: document.ConversationID.Hex(),
		Role:           document.Role,
		Content:        document.Content,
		Source:         document.Source,
		CreatedAt:      document.CreatedAt,
	}
}
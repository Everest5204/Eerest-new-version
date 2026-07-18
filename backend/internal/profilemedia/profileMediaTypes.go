package profilemedia

const (
	ProfileImageType = "profile_image"
	CoverImageType   = "cover_image"

	ProfileImageFolder = "everest/users/profile"
	CoverImageFolder   = "everest/users/cover"

	ProfilePhotoPostType = "profile_photo_update"
	CoverPhotoPostType   = "cover_photo_update"
)

type UpdatedUserResponse struct {
	ID string `bson:"_id,omitempty" json:"id,omitempty"`

	FirstName string `bson:"first_name" json:"first_name"`
	LastName  string `bson:"last_name" json:"last_name"`

	FollowersCount int64 `bson:"followers_count" json:"followers_count"`
	FollowingCount int64 `bson:"following_count" json:"following_count"`
	PostsCount     int64 `bson:"posts_count" json:"posts_count"`

	ProfileImageURL string `bson:"profile_image_url" json:"profile_image_url,omitempty"`
	ProfileImageID  string `bson:"profile_image_id" json:"profile_image_id,omitempty"`

	CoverImageURL string `bson:"cover_image_url" json:"cover_image_url,omitempty"`
	CoverImageID  string `bson:"cover_image_id" json:"cover_image_id,omitempty"`
}
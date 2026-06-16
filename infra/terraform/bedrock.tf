# Bedrock embeddings IAM for the ingest pipeline (issue #48).
#
# The backend ingest pipeline (backend/app/ingest/embed.py, BedrockTitanEmbedder)
# calls bedrock:InvokeModel against Titan Text Embeddings V2 to produce the
# 1024-dim vectors stored in pgvector. This defines the least-privilege policy
# that grants exactly that — scoped to the single Titan V2 foundation model in
# us-west-2 (var.region), nothing else.
#
# Foundation-model ARNs carry NO account id (the model is AWS-owned), and the
# region segment scopes the grant to us-west-2, satisfying the "in us-west-2"
# requirement on its own.
#
# This is a standalone, reusable customer-managed policy — it is intentionally
# NOT attached here:
#   - The Fargate task role (#42, not yet created) is where it ultimately
#     attaches for the deployed app; that PR consumes the ARN output below.
#   - Local-dev runs under the AWS SSO permission set (myisb_IsbUsersPS), which
#     is managed by AWS Identity Center, not this Terraform, so it can't be
#     attached from here.
#
# Out of band (not Terraformable): Bedrock model access for
# amazon.titan-embed-text-v2:0 must be enabled once in the console
# (Bedrock > Model access) for the us-west-2 sandbox account.

data "aws_iam_policy_document" "bedrock_titan_embed_invoke" {
  statement {
    sid       = "InvokeTitanEmbedV2"
    effect    = "Allow"
    actions   = ["bedrock:InvokeModel"]
    resources = ["arn:aws:bedrock:${var.region}::foundation-model/${var.bedrock_embedding_model_id}"]
  }
}

resource "aws_iam_policy" "bedrock_titan_embed_invoke" {
  name        = "empress-bedrock-titan-embed-invoke"
  description = "Allow bedrock:InvokeModel for Titan Text Embeddings V2 in ${var.region} (issue #48)."
  policy      = data.aws_iam_policy_document.bedrock_titan_embed_invoke.json
}

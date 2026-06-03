provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "EmpressOfJapan"
      ManagedBy   = "Terraform"
      Environment = "sandbox"
      Repository  = "YaoyiW27/empress-of-japan-capstone"
    }
  }
}

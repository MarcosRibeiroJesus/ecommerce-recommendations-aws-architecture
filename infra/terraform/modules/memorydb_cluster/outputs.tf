output "cluster_endpoint" {
  value = "${aws_memorydb_cluster.vector_cluster.cluster_endpoint[0].address}:${aws_memorydb_cluster.vector_cluster.cluster_endpoint[0].port}"
}

output "cluster_arn" {
  value = aws_memorydb_cluster.vector_cluster.arn
}
